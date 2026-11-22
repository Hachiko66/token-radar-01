// Board statistics for Token Radar radar-6.
//
// These helpers turn a scored board into the numbers the program logs and
// the dashboard shows in its lede: totals, medians, the top category, and
// the protocols a reader should look at first. Every figure here comes
// from the board itself, never from a hand-written list of names.

import type { BoardRow } from './model.ts';

/** A compact summary of one board. */
export interface BoardStats {
  rows: number;
  totalImpliedUsd: number;
  medianImpliedUsd: number;
  meanImpliedUsd: number;
  topThree: string[];
  topCategory: string | null;
  topCategoryUsd: number;
  growingRows: number;
  shrinkingRows: number;
  chainsCovered: number;
}

/** Format a dollar figure the way the dashboard does: $683.5M, $2.75B, $499.1M. */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

/** Format a seven-day change: +5.64%, -2.19%, or n/a when the snapshot has none. */
export function formatChange(change: number | null): string {
  if (change === null || !Number.isFinite(change)) return 'n/a';
  return `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
}

/** Format an age in days as 45d, 1.5y, or unknown. */
export function formatAge(days: number | null): string {
  if (days === null) return 'unknown';
  if (days >= 365) return `${(days / 365).toFixed(1)}y`;
  return `${Math.max(0, Math.round(days))}d`;
}

/** The board's own statistics, from its rows alone. */
export function boardStats(board: BoardRow[]): BoardStats {
  const sorted = [...board].sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  const total = sorted.reduce((acc, row) => acc + row.implied_value_usd, 0);
  const middle = sorted[Math.floor(sorted.length / 2)];
  const mean = sorted.length > 0 ? Math.round(total / sorted.length) : 0;
  const byCategory = new Map<string, number>();
  const chains = new Set<string>();
  let growing = 0;
  let shrinking = 0;
  for (const row of sorted) {
    const key = row.category ?? 'Other';
    byCategory.set(key, (byCategory.get(key) ?? 0) + row.implied_value_usd);
    for (const chain of row.chains) chains.add(chain);
    if ((row.change_7d ?? 0) > 0) growing += 1;
    if ((row.change_7d ?? 0) < 0) shrinking += 1;
  }
  let topCategory: string | null = null;
  let topCategoryUsd = 0;
  for (const [name, value] of byCategory) {
    if (value > topCategoryUsd) {
      topCategory = name;
      topCategoryUsd = value;
    }
  }
  return {
    rows: board.length,
    totalImpliedUsd: total,
    medianImpliedUsd: middle ? middle.implied_value_usd : 0,
    meanImpliedUsd: mean,
    topThree: sorted.slice(0, 3).map((row) => row.name),
    topCategory,
    topCategoryUsd,
    growingRows: growing,
    shrinkingRows: shrinking,
    chainsCovered: chains.size,
  };
}

/** One sentence a reader can quote about the board. */
export function boardSentence(board: BoardRow[], watchlistSize: number): string {
  const stats = boardStats(board);
  const top = stats.topThree.join(', ');
  return `${board.length} pre-token protocols (${watchlistSize} watchlist, ${board.length - watchlistSize} early) carry ${formatUsd(stats.totalImpliedUsd)} of implied value. The top three are ${top}.`;
}

/** The protocols whose seven-day growth is strongest, by implied value. */
export function fastestGrowing(board: BoardRow[], count: number): BoardRow[] {
  return [...board]
    .filter((row) => (row.change_7d ?? -Infinity) > 0)
    .sort((a, b) => (b.change_7d ?? 0) - (a.change_7d ?? 0))
    .slice(0, count);
}

/** The protocols with the most chains, a proxy for distribution breadth. */
export function widestReach(board: BoardRow[], count: number): BoardRow[] {
  return [...board]
    .sort((a, b) => b.chains.length - a.chains.length || b.implied_value_usd - a.implied_value_usd)
    .slice(0, count);
}

/** How many rows live on each chain, highest first. */
export interface ChainShare {
  chain: string;
  rows: number;
  totalImpliedUsd: number;
}

export function chainStats(board: BoardRow[]): ChainShare[] {
  const grouped = new Map<string, { rows: number; total: number }>();
  for (const row of board) {
    for (const chain of row.chains) {
      const entry = grouped.get(chain) ?? { rows: 0, total: 0 };
      entry.rows += 1;
      entry.total += row.implied_value_usd;
      grouped.set(chain, entry);
    }
  }
  return [...grouped.entries()]
    .map(([chain, entry]) => ({ chain, rows: entry.rows, totalImpliedUsd: entry.total }))
    .sort((a, b) => b.totalImpliedUsd - a.totalImpliedUsd);
}

/** A growth summary: how many rows grew, fell, or stayed flat in seven days. */
export function growthSummary(board: BoardRow[]): { growing: number; falling: number; flat: number } {
  let growing = 0;
  let falling = 0;
  let flat = 0;
  for (const row of board) {
    const change = row.change_7d ?? 0;
    if (change > 0) growing += 1;
    else if (change < 0) falling += 1;
    else flat += 1;
  }
  return { growing, falling, flat };
}
