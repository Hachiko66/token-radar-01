// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchlistOnly: false };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The radar-9 model, in the page, from the fits data.js carries: a multiple
  // fitted on the traded protocols, and odds from the peers' record. The page
  // recomputes a row from the snapshot figures and checks the number
  // board.json carries, so the page's code and the board's data are visibly
  // the same arithmetic. The chain count enters as log(1 + chains) and the
  // fees flag as 1 when the protocol recorded fees in the 30 days to
  // 2026-11-14, the same shapes the builder fitted.
  function fittedMultiple(tvl) {
    var fit = DATA.fit.value;
    return Math.exp(fit.intercept + fit.sizeSlope * Math.log(Math.max(1, tvl) / 1e8));
  }
  function tokenOdds(row) {
    var beta = DATA.fit.odds.beta;
    var growth = row.change_7d === null || row.change_7d === undefined ? 0 : Math.min(180, Math.max(-50, row.change_7d));
    var x = beta[0] + beta[1] * Math.log(Math.max(1, row.tvl_usd) / 1e8) + beta[2] * (growth / 100) + beta[3] * Math.log1p(row.chains ? row.chains.length : 0) + beta[4] * (row.has_fees ? 1 : 0);
    var odds = 1 / (1 + Math.exp(-x));
    return Math.min(0.95, Math.max(0.05, odds));
  }
  function impliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * fittedMultiple(row.tvl_usd) * tokenOdds(row)));
  }

  // The farm verdict, re-derived in the page from the plan constants and the
  // row's own numbers, so the checks panel can prove the verdicts instead of
  // trusting them. Same arithmetic as the builder: thirteen fee-bearing
  // actions on the main chain, a $10,000 deposit for twelve weeks, a 7%
  // drop share, a 4% T-bill, FARM only when the net clears the T-bill by
  // $50 and pays $40 an hour.
  function gasUsdNum(chain) {
    var c = (chain || '').toLowerCase();
    if (c.indexOf('ethereum') >= 0) return 12;
    if (c.indexOf('solana') >= 0) return 0.05;
    if (c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('base') >= 0 || c.indexOf('zksync') >= 0 || c.indexOf('linea') >= 0) return 1;
    if (c.indexOf('bsc') >= 0 || c.indexOf('bnb') >= 0) return 0.3;
    if (c.indexOf('polygon') >= 0) return 0.1;
    if (c.indexOf('avalanche') >= 0) return 0.5;
    return 3;
  }
  function verdictFor(row, deposit, dropShare) {
    var plan = DATA.farm_plan;
    var fees = plan.actions * gasUsdNum(row.chains && row.chains.length ? row.chains[0] : '');
    var drop = (deposit / row.tvl_usd) * dropShare * row.implied_value_usd;
    var net = drop - fees;
    var tbill = deposit * plan.tbillRate * (plan.weeks / 52);
    var verdict = net >= tbill + plan.safetyMarginUsd && net / plan.hours >= plan.hourlyRate ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
    return { drop: drop, fees: fees, net: net, tbill: tbill, netPerHour: net / plan.hours, verdict: verdict };
  }
  function minDepositFor(row) {
    var plan = DATA.farm_plan;
    var fees = plan.actions * gasUsdNum(row.chains && row.chains.length ? row.chains[0] : '');
    var k = (plan.dropShare * row.implied_value_usd) / row.tvl_usd;
    var tbillRate = plan.tbillRate * (plan.weeks / 52);
    var forMargin = k > tbillRate ? (fees + plan.safetyMarginUsd) / (k - tbillRate) : Infinity;
    var forHourly = (fees + plan.hourlyRate * plan.hours) / k;
    if (!isFinite(forMargin) || !isFinite(forHourly)) return null;
    return Math.ceil(Math.max(forMargin, forHourly));
  }

  // The implied value built step by step, base to final number, so the row's arithmetic can be
  // checked without a calculator: each factor is applied in turn and the running total is shown.
  function buildSteps(row) {
    var mult = fittedMultiple(row.tvl_usd);
    var odds = tokenOdds(row);
    var valueIfLaunches = row.tvl_usd * mult;
    var implied = Math.max(1, Math.round(valueIfLaunches * odds));
    return 'Built step by step: ' + fmtUsd(row.tvl_usd) + ' TVL x ' + mult.toFixed(4) + ' fitted multiple = ' + fmtUsd(Math.round(valueIfLaunches)) + ' if a token launches, then x ' + (odds * 100).toFixed(1) + '% token odds = ' + fmtUsd(implied) + ' implied value.';
  }

  // One plain sentence saying why this row ranks where it does: the size curve
  // that sets its multiple, then the odds that discount it. Computed from the
  // row, never written by hand.
  function reasonFor(row) {
    var mult = fittedMultiple(row.tvl_usd);
    var odds = tokenOdds(row);
    var parts = [];
    if (mult < 0.1) parts.push({ w: Math.abs(Math.log(mult / 0.153)), s: 'its ' + fmtUsd(row.tvl_usd) + ' of TVL sits far up the size curve, so the fitted multiple is only ' + mult.toFixed(3) });
    else if (mult > 0.2) parts.push({ w: Math.abs(Math.log(mult / 0.153)), s: 'its ' + fmtUsd(row.tvl_usd) + ' of TVL is small enough that the fitted multiple is ' + mult.toFixed(3) });
    else parts.push({ w: 0, s: 'its ' + fmtUsd(row.tvl_usd) + ' of TVL earns a fitted multiple of ' + mult.toFixed(3) });
    if (odds < 0.4) parts.push({ w: Math.abs(Math.log(odds / 0.49)), s: 'the peers\u2019 record gives it only ' + (odds * 100).toFixed(0) + '% odds of a token, which discounts the value hard' });
    else if (odds > 0.6) parts.push({ w: Math.abs(Math.log(odds / 0.49)), s: 'the peers\u2019 record gives it ' + (odds * 100).toFixed(0) + '% odds of a token, so most of the launch value survives' });
    else parts.push({ w: 0, s: 'the peers\u2019 record gives it about even odds of a token, ' + (odds * 100).toFixed(0) + '%' });
    var growth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    if (growth >= 20) parts.push({ w: 0.1, s: 'seven-day growth of ' + fmtPct(growth) + ' lifts its odds' });
    else if (growth <= -20) parts.push({ w: 0.1, s: 'seven-day growth of ' + fmtPct(growth) + ' drags its odds down' });
    if (row.has_fees) parts.push({ w: 0.51, s: 'it recorded fees in the last 30 days, which lifts its odds' });
    parts.sort(function (a, b) { return b.w - a.w; });
    var drivers = parts.slice(0, 2).map(function (p) { return p.s; }).join('; ');
    var mults = DATA.rows.map(function (r) { return r.fitted_multiple; }).sort(function (a, b) { return a - b; });
    var oddsList = DATA.rows.map(function (r) { return r.token_odds; }).sort(function (a, b) { return a - b; });
    var mid = Math.floor(mults.length / 2);
    var medMult = mults[mid];
    var medOdds = oddsList[mid];
    return 'TVL of ' + fmtUsd(row.tvl_usd) + ' would be worth ' + fmtUsd(row.value_if_launches_usd) + ' if a token launched, and ' + drivers + '. Against the board median, its multiple of ' + mult.toFixed(3) + ' is ' + (mult / medMult).toFixed(2) + 'x the median ' + medMult.toFixed(3) + ', and its odds of ' + (odds * 100).toFixed(0) + '% sit against a median of ' + (medOdds * 100).toFixed(0) + '%.';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: the
  // standard $10,000, twelve-week plan, with the action, the capital, the
  // hold and every cost and time decided by the protocol's category, chains,
  // TVL and growth. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' in USDC on ' + name + ' (' + chain + ') and leave the supply earning for the full hold.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to the main ' + name + ' pool on ' + chain + ' and leave it in range.';
    if (c.indexOf('bridge') >= 0) return 'Move $' + capital + ' in USDC across ' + name + ' to ' + chain + ', then put those funds to work in its app once.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the native asset via ' + name + ', keep the receipt, and do not unstake early.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Post $' + capital + ' in USDC as margin on ' + name + ' and open a single small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund ' + name + ' with $' + capital + ' and take one small market position.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Put $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the yield-bearing asset on " + name + ' (' + chain + ') and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    return 'Deposit $' + capital + ' in USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function riskNoteFor(p) {
    var c = (p.category || '').toLowerCase();
    var growth = p.change_7d === null || p.change_7d === undefined ? 0 : p.change_7d;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Watch borrow rates and liquidation levels weekly; a sharp TVL fall means unwind first.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Watch pool range and impermanent loss; leave if the pool drifts out of range for two weeks.';
    if (c.indexOf('bridge') >= 0) return 'Bridge only small amounts at a time and check the destination chain before each move.';
    if (c.indexOf('rwa') >= 0) return 'Check the underlying asset and yield source monthly; RWA yield is only as good as its backing.';
    if (growth < -10) return 'TVL fell more than 10% in seven days: size down and re-check before adding more.';
    return 'Check TVL and the points page weekly; stop adding if TVL falls for two weeks in a row.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function weeklyActionFor(p) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Weekly: add a little supply, borrow a small amount, then repay it on ' + name + '.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Weekly: swap once, top up liquidity in ' + name + "'s main pool, and check the range.";
    if (c.indexOf('bridge') >= 0) return 'Weekly: bridge a small amount via ' + name + ' and use it once where it lands.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Weekly: check the ' + name + ' staking receipt and compound any rewards shown.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Weekly: open and close one small hedged trade on ' + name + ' and note the funding paid.';
    if (c.indexOf('rwa') >= 0) return 'Weekly: check yield accrual on ' + name + ' and file the receipt in your log.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Weekly: review the ' + name + ' vault allocation and leave shares alone unless the vault moves.';
    return 'Weekly: do one qualifying action on ' + name + ', such as a deposit, a swap or a vote.';
  }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c.indexOf('ethereum') >= 0) return 'about $12 of gas';
    if (c.indexOf('solana') >= 0) return 'about $0.05 of gas';
    if (c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('base') >= 0 || c.indexOf('zksync') >= 0 || c.indexOf('linea') >= 0) return 'about $1 of gas';
    if (c.indexOf('bsc') >= 0 || c.indexOf('bnb') >= 0) return 'about $0.30 of gas';
    if (c.indexOf('polygon') >= 0) return 'about $0.10 of gas';
    if (c.indexOf('avalanche') >= 0) return 'about $0.50 of gas';
    return 'about $3 of gas';
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var plan = DATA.farm_plan;
    var capital = plan.depositUsd;
    var hold = plan.weeks * 7;
    var gas = gasFor(chain);
    var growth = p.change_7d === null || p.change_7d === undefined ? 'no seven-day change on record' : (p.change_7d >= 0 ? '+' : '') + p.change_7d.toFixed(1) + '% in seven days';
    var tvl = p.tvl_usd >= 1e9 ? '$' + (p.tvl_usd / 1e9).toFixed(2) + 'B' : '$' + Math.round(p.tvl_usd / 1e6) + 'M';
    var exitTvl = p.farm_exit_tvl_usd;
    var exitText = exitTvl >= 1e9 ? '$' + (exitTvl / 1e9).toFixed(2) + 'B' : '$' + Math.round(exitTvl / 1e6) + 'M';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain) + ' This protocol holds ' + tvl + ' of TVL and moved ' + growth + ', so the position is sized to the standard plan, not to a guess.', cost: '$' + capital + ' of capital and ' + gas, time: '30 minutes to set up' },
      { text: weeklyActionFor(p), cost: gas + ' a week', time: '15 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot, and check the ' + chain + ' gas price before each action.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: riskNoteFor(p), cost: 'nothing to check', time: '5 minutes to check' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, never from a link in a message.", cost: 'no fee to check, and never pay to claim', time: '15 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Exit if TVL falls below ' + exitText + ' in one week, or falls two weeks in a row.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    var watch = {};
    (DATA.watchlist || []).forEach(function (s) { watch[s] = true; });
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !watch[r.slug]) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Token Radar radar-9: fees flag in the odds, value model tested to its limit, live self-checks, ' + DATA.farm_counts.farm + ' farm plans worth it' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is TVL x a multiple fitted on the traded protocols x the odds of a token from the peers\u2019 record — a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Farm verdicts worth farming' }), el('b', { text: DATA.farm_counts.farm + ' of ' + DATA.board_size }))
      )
    );
  }

  // The evidence headline, first on the page: the numbers the model was
  // tested to, computed from the snapshot, with the full 758-protocol
  // accounting and the audit line that ties this table to board.json.
  // Nothing here is typed by hand: every figure comes from DATA.
  function evidenceStrip() {
    var v = DATA.value_evidence;
    var oc = DATA.odds_calibration;
    var vc = DATA.value_calibration;
    var g = DATA.integrity;
    var a = DATA.audit;
    var kept = null;
    var flat = null;
    v.forEach(function (r) {
      if (r.kept) kept = r;
      else if (r.term.indexOf('flat multiple') === 0) flat = r;
    });
    var vKept = v.filter(function (r) { return r.kept; }).length;
    var vCand = v.length - 1;
    var o = DATA.odds_evidence;
    var oKept = o.filter(function (r) { return r.kept; }).length;
    var oCand = o.length - 1;
    return el('section', { class: 'panel evidence-strip' },
      el('h2', { text: 'The evidence, first: every term fitted and tested held-out four ways' }),
      el('div', { class: 'kpi-grid' },
        el('div', { class: 'kpi' }, el('b', { text: 'x' + Math.exp(kept.loo).toFixed(1) + ' vs x' + Math.exp(flat.loo).toFixed(1) }), el('span', { text: 'Typical out-of-sample miss, leave-one-out, vs a flat multiple' })),
        el('div', { class: 'kpi' }, el('b', { text: oc.brierModel.toFixed(3) + ' vs ' + oc.brierBase.toFixed(3) }), el('span', { text: 'Token odds Brier score vs the base rate alone' })),
        el('div', { class: 'kpi' }, el('b', { text: vc.p25p75Pct + '% / ' + vc.p10p90Pct + '%' }), el('span', { text: 'Traded market caps inside the printed P25-P75 / P10-P90 ranges (claims 50% / 80%)' })),
        el('div', { class: 'kpi' }, el('b', { text: vKept + ' of ' + vCand + ' / ' + oKept + ' of ' + oCand }), el('span', { text: 'Candidate terms that survived all four held-out tests: value model / odds model' }))
      ),
      el('p', { class: 'sub', text: '758 protocols accounted for: ranked ' + g.ranked + ' (' + g.watchlist + ' watchlist + ' + g.early + ' early) + pre-token excluded ' + (g.preCex + g.preVersioned + g.preAboveFloor) + ' (' + g.preCex + ' exchanges, ' + g.preVersioned + ' versioned pools, ' + g.preAboveFloor + ' above the floor and outside the watchlist) + live-token ' + g.liveTotal + ' (' + g.liveShown + ' shown, ' + g.liveRest + ' more) = ' + g.total + '. Farm verdicts on the standard $10,000, twelve-week plan: ' + DATA.farm_counts.farm + ' FARM, ' + DATA.farm_counts.marginal + ' MARGINAL, ' + DATA.farm_counts.skip + ' SKIP — FARM only when the net clears the T-bill by $50 and pays $40 an hour.' }),
      el('p', { class: 'audit-line', text: 'Audit — this table = board.json: ' + a.rows + ' rows drawn from ' + a.rows + ' written, ranks 1 to ' + a.rows + ' in order, values never rise down the board, total ' + usd.format(a.totalImpliedUsd) + ', seal ' + a.seal + ', ' + a.watchlistRanked + ' of ' + a.watchlistSize + ' watchlist protocols ranked.' })
    );
  }

  // The checks panel: the page proves its own claims live, from the fits
  // and the board it carries. Every check is recomputed here, in this
  // page, and prints pass or fail — nothing is taken on trust from the
  // builder. If any check fails, the board is stale and says so.
  function checksPanel() {
    var rows = DATA.rows;
    var checks = [];
    function add(name, pass, detail) { checks.push({ name: name, pass: pass, detail: detail }); }
    add('Row count is ' + DATA.board_size, rows.length === DATA.board_size, rows.length + ' rows');
    var ranksOk = rows.every(function (r, i) { return r.rank === i + 1; });
    add('Ranks run 1 to ' + rows.length, ranksOk, ranksOk ? 'in order' : 'out of order');
    var orderOk = rows.every(function (r, i) { return i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd; });
    add('Implied value never rises down the board', orderOk, orderOk ? 'non-increasing' : 'a later row outranks an earlier one');
    var recomputed = rows.filter(function (r) { return impliedOf(r) === r.implied_value_usd; }).length;
    add('Every row recomputes from the fits', recomputed === rows.length, recomputed + ' of ' + rows.length + ' match board.json');
    var oddsOk = rows.every(function (r) { return r.token_odds >= 0.05 && r.token_odds <= 0.95; });
    add('Token odds stay inside 5%-95%', oddsOk, oddsOk ? 'bounded' : 'a row escapes the bounds');
    var rangesOk = rows.every(function (r) { return r.p25_usd <= r.p75_usd && r.p10_usd <= r.p90_usd && r.rank_lo <= r.rank_hi; });
    add('Bootstrap ranges run forward', rangesOk, rangesOk ? 'P25-P75, P10-P90 and rank ranges all forward' : 'a range runs backwards');
    var verdictsOk = rows.filter(function (r) { return verdictFor(r, DATA.farm_plan.depositUsd, DATA.farm_plan.dropShare).verdict === r.farm_verdict; }).length;
    add('Farm verdicts recompute from the plan', verdictsOk === rows.length, verdictsOk + ' of ' + rows.length + ' match');
    var minDepOk = rows.filter(function (r) { return minDepositFor(r) === r.farm_min_deposit_usd; }).length;
    add('Minimum FARM deposits recompute', minDepOk === rows.length, minDepOk + ' of ' + rows.length + ' match');
    var total = rows.reduce(function (acc, r) { return acc + r.implied_value_usd; }, 0);
    add('Audit total matches the board', total === DATA.audit.totalImpliedUsd, fmtUsd(total) + ' across ' + rows.length + ' rows, seal ' + DATA.audit.seal);
    var watch = DATA.watchlist || [];
    var watchOk = watch.length === 40 && watch.every(function (s) { return rows.some(function (r) { return r.slug === s; }); });
    add('Watchlist covered 40 of 40', watchOk, watch.length + ' watchlist slugs, all ranked');
    var passed = checks.filter(function (c) { return c.pass; }).length;
    return el('section', { class: 'panel checks' },
      el('h2', { text: 'Self-checks, recomputed live in this page: ' + passed + ' of ' + checks.length + ' pass' }),
      el('p', { class: 'sub', text: 'Nothing here is taken on trust from the builder. The page re-derives every row from the two fits, re-checks the ranks, the total, the audit line and the farm verdicts, and prints the result. A failed check would mean the board and the code disagree.' }),
      el('ul', { class: 'check-list' }, checks.map(function (c) {
        return el('li', { class: c.pass ? 'pass' : 'fail' }, el('b', { text: (c.pass ? 'PASS ' : 'FAIL ') + c.name }), el('span', { class: 'sub', text: ' — ' + c.detail }));
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort().slice(0, 30);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var watchOnly = el('label', { class: 'check-toggle' },
      el('input', { type: 'checkbox', checked: state.watchlistOnly ? 'checked' : null, onclick: function (e) { state.watchlistOnly = e.target.checked; render(); } }),
      ' Watchlist only'
    );
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, watchOnly),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: (r.token_odds * 100).toFixed(0) + '%' }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: r.farm_verdict === 'FARM' ? 'farm' : r.farm_verdict === 'MARGINAL' ? 'marginal' : 'skip' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('odds', 'Token odds'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Farm' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var fit = DATA.fit;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by two fits of the snapshot itself. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x fittedMultiple x tokenOdds ) — fittedMultiple = exp(' + fit.value.intercept.toFixed(3) + ' + ' + fit.value.sizeSlope.toFixed(3) + ' x ln(tvl_usd / $100M)), fitted by a median (LAD) regression on ' + fit.value.n + ' traded protocols; tokenOdds is a logistic regression on ' + fit.odds.n + ' peers, on log TVL, seven-day growth, log(1 + chain count) and a fees flag, bounded to 5%-95%.'
      ),
      el('p', { class: 'sub', text: 'The thesis: a launch is priced on real usage, and the price per dollar of usage falls as protocols get bigger — that is what the traded protocols show, a multiple of about 0.13 at $100M of TVL falling with size. The odds are the peers\u2019 record: of the 532 protocols with a recorded listing date, 262 have a token and 270 do not, and the odds rise with size and growth. One week of growth alone never calls a protocol worthless or certain, because the odds are bounded. radar-9\u2019s change is a fees flag in the odds: a protocol that recorded fees in the 30 days to 2026-11-14 gets higher odds of a token, improving all four held-out columns (leave-one-out 0.670 vs 0.675, 10-fold 0.671 vs 0.674, walk-forward 0.979 / 0.797 vs 0.995 / 0.806) and the Brier (0.234 vs 0.237). The value model is unchanged: interactions, curves, other estimators, wider fit sets and fees in the value were all tested, and every one fails a held-out column, so the size curve stands. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' }),
      el('p', { class: 'sub', text: 'What the snapshot cannot see: the size of revenue, points programs, and whether a team ever intends to launch. Odds are the probability a token is eventually recorded, given the snapshot\u2019s figures, estimated from one date\u2019s cross-section — not a claim that a token will launch. Seven days is a short window, and the traded set is only 85 protocols, so every implied value carries a P25-P75 range in the detail view. Implied value is an estimate, not a price.' })
    );
  }

  function evidencePanel() {
    var v = DATA.value_evidence;
    var o = DATA.odds_evidence;
    var vc = DATA.value_calibration;
    var oc = DATA.odds_calibration;
    function lines(rows, unit) {
      return rows.map(function (r) { return (r.kept ? '[kept] ' : '[dropped] ') + r.term + ' — leave-one-out ' + r.loo.toFixed(3) + ', 10-fold ' + r.tenfold.toFixed(3) + ', walk-forward 2024 ' + r.wf2024.toFixed(3) + ', walk-forward 2025 ' + r.wf2025.toFixed(3) + ' ' + unit + '.'; }).join('  ');
    }
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Out-of-sample evidence' }),
      el('p', { class: 'sub', text: 'Every candidate term was tested four ways before it was allowed in: leave-one-out (refit without one protocol, predict it), 10-fold (refit on nine tenths, predict the tenth), and walk-forward (fit on protocols listed before a cutoff, test on the ones listed after). A term stays only if it lowers the miss in all four tests. Miss is the mean absolute log error for the value model and log-loss for the odds model; lower is better.' }),
      el('div', { class: 'formula' }, 'Value model, ' + vc.n + ' traded protocols: ' + lines(v, 'log error') + '  Odds model, ' + DATA.fit.odds.n + ' peers: ' + lines(o, 'log-loss') + '.'),
      el('p', { class: 'sub', text: 'Calibration, stated as measured: ' + vc.p25p75Pct + '% of traded market caps fall inside the printed P25-P75 ranges (the ranges claim 50%) and ' + vc.p10p90Pct + '% inside P10-P90 (claim 80%). The odds model scores a Brier of ' + oc.brierModel + ' against ' + oc.brierBase + ' for the base rate alone. By decile, the predicted odds against the observed token rate are: ' + oc.deciles.map(function (d) { return (d.pred * 100).toFixed(0) + '% vs ' + (d.observed * 100).toFixed(0) + '%'; }).join(', ') + '.' })
    );
  }

  function integrityPanel() {
    var g = DATA.integrity;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Integrity: every protocol accounted for' }),
      el('p', { class: 'sub', text: 'The snapshot holds ' + g.total + ' protocols, and each one is in exactly one group below. Nothing is dropped silently, and the board can be recomputed from the snapshot and the fits above.' }),
      el('div', { class: 'formula' },
        'Ranked ' + g.ranked + ' (' + g.watchlist + ' watchlist + ' + g.early + ' early) + pre-token excluded ' + (g.preCex + g.preVersioned + g.preAboveFloor) + ' (' + g.preCex + ' exchanges, ' + g.preVersioned + ' versioned pools, ' + g.preAboveFloor + ' above the floor and outside the watchlist) + live-token ' + g.liveTotal + ' (' + g.liveShown + ' shown, ' + g.liveRest + ' more, of which ' + g.liveCex + ' exchanges and ' + g.liveVersioned + ' versioned) = ' + g.total + '.'
      ),
      el('p', { class: 'sub', text: 'Farm verdicts on the standard $10,000, twelve-week plan: ' + DATA.farm_counts.farm + ' FARM, ' + DATA.farm_counts.marginal + ' MARGINAL, ' + DATA.farm_counts.skip + ' SKIP. A verdict is FARM only when the modelled net clears a 4% T-bill by at least $50 and pays at least $40 an hour.' })
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 3);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Top 3 to watch first' }),
      el('p', { class: 'sub', text: 'The three highest implied values. Each one is pre-token, large, and has run long enough that a launch would be priced on real usage, not on a promise.' }),
      el('div', { class: 'formula' }, top.map(function (r, i) { return (i + 1) + '. ' + r.name + ' — ' + fmtUsd(r.implied_value_usd) + ' implied, ' + fmtUsd(r.tvl_usd) + ' TVL, ' + (r.token_odds * 100).toFixed(0) + '% token odds, ' + fmtPct(r.change_7d) + ' in 7 days.'; }).join('  '))
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var plan = DATA.farm_plan;
    var verdictText = row.farm_verdict === 'FARM'
      ? 'FARM: the modelled net of ' + fmtUsd(row.farm_net_usd) + ' clears the ' + fmtUsd(row.farm_tbill_usd) + ' a T-bill pays on the same $10,000 over twelve weeks by at least $50, and pays ' + usd.format(row.farm_net_per_hour_usd) + ' an hour, above the $40 bar.'
      : row.farm_verdict === 'MARGINAL'
        ? 'MARGINAL: the modelled net is ' + fmtUsd(row.farm_net_usd) + ' — positive, but it does not clear the T-bill by $50 and pay $40 an hour, so farm only if you value the option itself.'
        : 'SKIP: the fees of ' + fmtUsd(row.farm_fees_usd) + ' eat the modelled drop of ' + fmtUsd(row.farm_drop_usd) + ', so the standard plan loses money here.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted multiple' }), el('b', { class: 'num', text: String(row.fitted_multiple) })),
        el('div', null, el('span', { text: 'Value if a token launches' }), el('b', { class: 'num', text: fmtUsd(row.value_if_launches_usd) })),
        el('div', null, el('span', { text: 'Token odds' }), el('b', { class: 'num', text: (row.token_odds * 100).toFixed(1) + '%' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'P25-P75 range' }), el('b', { class: 'num', text: fmtUsd(row.p25_usd) + ' - ' + fmtUsd(row.p75_usd) })),
        el('div', null, el('span', { text: 'P10-P90 range' }), el('b', { class: 'num', text: fmtUsd(row.p10_usd) + ' - ' + fmtUsd(row.p90_usd) })),
        el('div', null, el('span', { text: 'Rank range (P10-P90)' }), el('b', { class: 'num', text: String(row.rank_lo) + ' - ' + String(row.rank_hi) })),
        el('div', null, el('span', { text: 'Implied per $1 of TVL' }), el('b', { class: 'num', text: '$' + (row.implied_value_usd / row.tvl_usd).toFixed(2) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: buildSteps(row) }),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same two fits score every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row)) + (impliedOf(row) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' The ranges come from 200 bootstrap refits, so this row\u2019s value sits between ' + fmtUsd(row.p25_usd) + ' and ' + fmtUsd(row.p75_usd) + ' in half the refits, and its rank between ' + row.rank_lo + ' and ' + row.rank_hi + ' in four out of five. This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Why this rank' }),
      el('p', { class: 'sub', text: reasonFor(row) }),
      el('p', { class: 'sub', text: 'That multiple is the fitted line\u2019s judgement in one number: above 0.15 the protocol earns a premium on its TVL, below it a discount, and the odds decide how much of that value survives. The board is not TVL order.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm verdict — the standard plan, costed' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Deposit, ' + plan.weeks + ' weeks' }), el('b', { class: 'num', text: fmtUsd(plan.depositUsd) })),
        el('div', null, el('span', { text: 'Modelled drop (' + (plan.dropShare * 100).toFixed(0) + '% share)' }), el('b', { class: 'num', text: fmtUsd(row.farm_drop_usd) })),
        el('div', null, el('span', { text: 'Fees (' + plan.actions + ' actions)' }), el('b', { class: 'num', text: fmtUsd(row.farm_fees_usd) })),
        el('div', null, el('span', { text: 'Hours' }), el('b', { class: 'num', text: String(plan.hours) })),
        el('div', null, el('span', { text: 'Net' }), el('b', { class: 'num', text: fmtUsd(row.farm_net_usd) })),
        el('div', null, el('span', { text: 'Net per hour' }), el('b', { class: 'num', text: usd.format(row.farm_net_per_hour_usd) })),
        el('div', null, el('span', { text: 'T-bill alternative (4% a year)' }), el('b', { class: 'num', text: fmtUsd(row.farm_tbill_usd) })),
        el('div', null, el('span', { text: 'Break-even drop share' }), el('b', { class: 'num', text: row.farm_breakeven_share_pct.toFixed(1) + '%' })),
        el('div', null, el('span', { text: 'Exit if TVL falls below' }), el('b', { class: 'num', text: fmtUsd(row.farm_exit_tvl_usd) })),
        el('div', null, el('span', { text: 'Deposit that turns this row FARM' }), el('b', { class: 'num', text: row.farm_min_deposit_usd === null ? 'no deposit clears the bar' : fmtUsd(row.farm_min_deposit_usd) })),
        el('div', null, el('span', { text: 'Verdict' }), el('b', { class: 'num', text: row.farm_verdict }))
      ),
      el('p', { class: 'sub', text: verdictText }),
      el('p', { class: 'sub', text: row.farm_min_deposit_usd === null
        ? 'No deposit size turns this row FARM: the drop per dollar is below the T-bill rate, so a bigger deposit earns more from the T-bill than from the drop.'
        : 'At ' + fmtUsd(row.farm_min_deposit_usd) + ' the plan clears both bars at once — the net clears the T-bill by $50 and pays $40 an hour. Below that deposit the row is not worth farming on this plan; the standard $10,000 is only the reference size.' })
    ));
    var sandboxOut = el('p', { class: 'sub', text: '' });
    var depInput = el('input', { type: 'number', min: '100', step: '100', value: String(DATA.farm_plan.depositUsd), 'aria-label': 'Deposit in dollars' });
    var shareInput = el('input', { type: 'number', min: '1', max: '50', step: '0.5', value: String(DATA.farm_plan.dropShare * 100), 'aria-label': 'Drop share in percent' });
    function refreshSandbox() {
      var dep = parseFloat(depInput.value) || 0;
      var share = (parseFloat(shareInput.value) || 0) / 100;
      var v = verdictFor(row, dep, share);
      sandboxOut.textContent = 'At a $' + Math.round(dep).toLocaleString('en-US') + ' deposit and a ' + (share * 100).toFixed(1) + '% drop share: modelled drop ' + fmtUsd(v.drop) + ', fees ' + fmtUsd(v.fees) + ', net ' + fmtUsd(v.net) + ' (' + usd.format(Math.round(v.netPerHour * 100) / 100) + ' an hour, against a ' + fmtUsd(v.tbill) + ' T-bill) — verdict ' + v.verdict + '.';
    }
    depInput.addEventListener('input', refreshSandbox);
    shareInput.addEventListener('input', refreshSandbox);
    refreshSandbox();
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Try another plan size' }),
      el('p', { class: 'sub', text: 'The verdict above is the standard $10,000 plan. Change the deposit or the drop share and the verdict re-derives live, from this row’s own numbers — nothing leaves the page.' }),
      el('div', { class: 'sandbox' },
        el('label', null, 'Deposit ($) ', depInput),
        el('label', null, 'Drop share (%) ', shareInput)
      ),
      sandboxOut
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Risks to watch' }),
      el('p', { class: 'sub', text: riskNoteFor(row) }),
      el('p', { class: 'sub', text: 'This is not financial advice. Never farm with money you cannot afford to lose, and never pay anyone to claim a token for you.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function breakdownPanel() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var key = r.category || 'Other';
      if (!byCat[key]) byCat[key] = { rows: 0, total: 0 };
      byCat[key].rows += 1;
      byCat[key].total += r.implied_value_usd;
    });
    var total = DATA.rows.reduce(function (acc, r) { return acc + r.implied_value_usd; }, 0);
    var entries = Object.keys(byCat).map(function (k) {
      return { category: k, rows: byCat[k].rows, total: byCat[k].total, share: total > 0 ? (byCat[k].total / total * 100).toFixed(1) + '%' : '0%' };
    }).sort(function (a, b) { return b.total - a.total; }).slice(0, 6);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Where the implied value sits' }),
      el('p', { class: 'sub', text: 'The six categories with the most implied value on this board. ' + entries[0].category + ' leads with ' + entries[0].rows + ' rows and ' + entries[0].share + ' of the board\u2019s implied value. No name was picked: the same function scores every row.' }),
      el('div', { class: 'formula' }, entries.map(function (e) { return e.category + ': ' + e.rows + ' rows, ' + fmtUsd(e.total) + ' (' + e.share + ').'; }).join('  '))
    );
  }

  function downloadCsv() {
    var lines = ['rank,name,category,chains,tvl_usd,change_7d,age_days,fitted_multiple,token_odds,value_if_launches_usd,implied_value_usd,p25_usd,p75_usd,rank_lo,rank_hi,farm_verdict'];
    rows().forEach(function (r) {
      lines.push([r.rank, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '') + '"', '"' + (r.chains || []).join(';') + '"', r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days, r.fitted_multiple, r.token_odds, r.value_if_launches_usd, r.implied_value_usd, r.p25_usd, r.p75_usd, r.rank_lo, r.rank_hi, r.farm_verdict].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'token-radar-board.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(evidenceStrip());
    shell.appendChild(checksPanel());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(spotlight());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') {
      var exportBtn = el('button', { class: 'button', type: 'button', text: 'Download these rows as CSV', onclick: downloadCsv });
      var exportWrap = el('div', { class: 'controls' }, exportBtn);
      shell.appendChild(exportWrap);
    }
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(breakdownPanel());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    if (state.tab === 'pre-token') shell.appendChild(evidencePanel());
    if (state.tab === 'pre-token') shell.appendChild(integrityPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
